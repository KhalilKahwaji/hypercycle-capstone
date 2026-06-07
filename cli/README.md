# HyperSensei CLI

A thin command-line client for your HyperCycle coding bootcamp.

## Install

```bash
pip install -e ./cli
```

## Commands

| Command | Description |
|---|---|
| `hypersensei login` | Authenticate (saves token to `~/.hypersensei/config.json`) |
| `hypersensei status` | Show progress and day list |
| `hypersensei task` | Print your current day's full task spec |
| `hypersensei help "your question"` | Ask HyperSensei for a hint |
| `hypersensei check` | Dry-run evaluation of your project files (nothing stored) |
| `hypersensei push` | Submit your project for real evaluation |

## Usage

```bash
# First, log in
hypersensei login

# See where you are
hypersensei status

# Read the current day's task
hypersensei task

# Evaluate your code without submitting
hypersensei check

# Submit for real
hypersensei push

# Ask for help
hypersensei help "What does this evaluation criteria mean?"
```

## Configuration

Config is stored in `~/.hypersensei/config.json`. Override the API URL:

```bash
hypersensei login --api-url https://your-custom-api.example.com
# or
export HYPERSENSEI_API_URL=https://your-custom-api.example.com
```

## File gathering

`check` and `push` walk your current directory and collect text files,
skipping: `.git`, `node_modules`, `venv`, `__pycache__`, `dist`, `.env*`,
lock files, binaries, and anything matched by your `.gitignore`.
Output is truncated to 12 000 characters to fit the model context window.
