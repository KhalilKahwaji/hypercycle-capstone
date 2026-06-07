import { useState } from "react";

const INSTALL_CMD =
  `pip install "git+https://github.com/KhalilKahwaji/hypercycle-capstone.git#subdirectory=cli"`;

const COMMANDS = [
  {
    cmd: "hypersensei login",
    desc: "Authenticate with the HyperCycle API. Saves your token to ~/.hypersensei/config.json.",
    example: "hypersensei login\nhypersensei login --api-url https://custom.example.com",
  },
  {
    cmd: "hypersensei status",
    desc: "Show your progress bar and a full list of days marked [done], [active], or [locked].",
    example: "hypersensei status",
  },
  {
    cmd: "hypersensei task",
    desc: "Print your current day's full task spec: objective, task description, expected output, and evaluation criteria.",
    example: "hypersensei task",
  },
  {
    cmd: `hypersensei help "your question"`,
    desc: "Ask HyperSensei for a hint about your current task. It nudges — it won't give you the full solution.",
    example: `hypersensei help "How do I connect to Supabase from FastAPI?"`,
  },
  {
    cmd: "hypersensei check",
    desc: "Scan your project files and run a dry-run evaluation. Nothing is stored — safe to run as many times as you want.",
    example: "hypersensei check",
  },
  {
    cmd: "hypersensei push",
    desc: "Submit your project for real evaluation. Prompts for confirmation before sending anything.",
    example: "hypersensei push",
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      className="ghost"
      onClick={copy}
      style={{ fontSize: 12, padding: "3px 10px", whiteSpace: "nowrap", flexShrink: 0 }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function CliTool() {
  return (
    <div>
      <h1 className="page-title">HyperSensei CLI</h1>
      <p className="page-sub">
        A terminal companion that checks your code and gives AI hints — the same
        evaluation engine as this site, directly in your shell.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0, color: "var(--amber)" }}>Install</h2>
        <p className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
          Requires Python 3.9+. Run this once in any terminal:
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div className="mono-block" style={{ flex: 1, marginBottom: 0, overflowX: "auto" }}>
            {INSTALL_CMD}
          </div>
          <CopyButton text={INSTALL_CMD} />
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          Then run{" "}
          <code style={{ color: "var(--amber)", fontSize: 12 }}>hypersensei login</code>{" "}
          to authenticate with your HyperCycle account.
        </p>
      </div>

      <h2 className="section-title">Commands</h2>
      {COMMANDS.map(({ cmd, desc, example }) => (
        <div key={cmd} className="card" style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <code style={{ color: "var(--amber)", fontWeight: 700, fontSize: 14 }}>{cmd}</code>
            <CopyButton text={example} />
          </div>
          <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>{desc}</p>
          <div className="mono-block" style={{ whiteSpace: "pre" }}>{example}</div>
        </div>
      ))}

      <div className="card">
        <h2 style={{ marginTop: 0, color: "var(--amber)" }}>How it works</h2>
        <ul className="fb-list">
          <li>
            <b>check</b> and <b>push</b> scan your current working directory, skipping{" "}
            <code>.git</code>, <code>node_modules</code>, <code>.env</code> files,
            lock files, and binary files.
          </li>
          <li>
            The collected code is sent to the same Groq model that grades your web
            submissions. Day 0 is a setup day — complete it on the site first.
          </li>
          <li>
            <b>check</b> is always a dry run — nothing is stored. <b>push</b> is the real
            submission and unlocks your next day on pass.
          </li>
          <li>
            Your token is saved in{" "}
            <code>~/.hypersensei/config.json</code>. Override the API URL with{" "}
            <code>--api-url</code> or the{" "}
            <code>HYPERSENSEI_API_URL</code> env var.
          </li>
        </ul>
      </div>
    </div>
  );
}
