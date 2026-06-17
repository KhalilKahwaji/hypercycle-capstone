PLATFORM_INFO = '''
AI Buddy is an AI-powered learning platform / self-driving coding bootcamp.
- A user signs up, completes a self-assessment (goals, known languages, experience
  level, age, hours per week), and an LLM generates a personalized program.
- A program has a Day 0 (environment/tools/GitHub setup, completed without AI review)
  followed by learning days. Each day has an objective, research topics (tools to
  learn), a task, an expected output (a "shippable"), and evaluation criteria.
- The user submits work for a day (text and/or files). An LLM evaluates it, gives a
  score 1-10, pass/fail (pass is 7+), strengths, issues, required fixes, and next
  steps. Passing unlocks the next day. Days can be locked or unlocked.
- Progress is tracked; users earn achievements/badges (e.g. First Steps, Perfectionist,
  On Fire streaks, Graduate) shown on their Profile.
- Admins can view all users, search users, see progress and submissions, and manually
  pass a day for a user with feedback.

hypersensei is the platform\'s command-line tool (installed via pip). It is a terminal
companion that talks to the same backend. Commands:
- hypersensei login: log in with your AI Buddy account; stores a token locally.
- hypersensei status: shows your progress and the list of days (done/unlocked/locked).
- hypersensei task: prints your current day\'s task, objective, expected output, and
  evaluation criteria.
- hypersensei help "question": ask the AI mentor a question about your current day;
  it gives hints without full answers.
- hypersensei check: a DRY RUN — gathers your project files and shows AI feedback
  without submitting or unlocking anything.
- hypersensei push: the REAL submission — evaluates your project, records it, and
  unlocks the next day if you pass.
The CLI automatically ignores junk (node_modules, venv, .git, .env secrets, binaries)
and respects your .gitignore when gathering files.
'''
