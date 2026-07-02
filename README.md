# Ringer

Ringer — parallel AI-agent swarm orchestrator. Ringside — its mission-control HUD.

Ringer reads a JSON manifest, creates one task directory per worker, runs workers in parallel, verifies results by executing your check commands, retries failures once, logs raw attempts, and writes live state for the web dashboard or Ringside.

`SwarmHUD.swift` is the deprecated macOS-only predecessor to Ringside. Keep it for reference; use the Tauri app in `hud/` for current builds.

## Quickstart

```bash
mkdir -p ~/.config/ringer
cp config.sample.toml ~/.config/ringer/config.toml
./ringer.py demo --dry-run
./ringer.py demo --no-dashboard
```

## Manifest

Run a manifest:

```bash
./ringer.py run ringer.json --max-parallel 4
```

Minimal `ringer.json`:

```json
{
  "run_name": "my-batch",
  "workdir": "/tmp/my-batch",
  "max_parallel": 3,
  "worktrees": false,
  "repo": null,
  "tasks": [
    {
      "key": "alpha",
      "engine": "codex",
      "spec": "Create alpha.txt containing exactly: alpha ready",
      "check": "test \"$(cat alpha.txt 2>/dev/null)\" = \"alpha ready\"",
      "expect_files": ["alpha.txt"],
      "timeout_s": 900,
      "full_access": false
    }
  ]
}
```

Manifest fields:

- `run_name`: required. Used in run IDs and dashboard labels.
- `workdir`: required. Each task gets `<workdir>/<key>/`.
- `max_parallel`: required. Number of workers to run at once.
- `worktrees`: optional boolean. When true, `repo` must point at a git repo and each task gets a worktree.
- `repo`: optional path. Used only with `worktrees`.
- `tasks`: required non-empty list.
- `tasks[].key`: required unique directory-safe task key.
- `tasks[].engine`: optional. Defaults to `codex`.
- `tasks[].spec`: required prompt passed to the worker.
- `tasks[].check`: required shell command. Exit 0 is pass.
- `tasks[].expect_files`: optional list of files that must exist and be non-empty before the check can pass.
- `tasks[].timeout_s`: optional worker timeout. Defaults to 900.
- `tasks[].full_access`: optional. Also requires `allow_full_access = true` in config.

## Config

Default path: `~/.config/ringer/config.toml`. `XDG_CONFIG_HOME` is respected. You can override with:

```bash
./ringer.py --config ./config.toml run ringer.json
./ringer.py run ringer.json --config ./config.toml
```

Public defaults are safe when no config exists:

- Engine binary is resolved with `shutil.which("codex")`.
- Sandbox is explicit `workspace-write`.
- Full access is denied.
- Eval logging goes to local JSONL only.
- State files go under `~/.ringer/runs/`.

Important config fields:

- `identity_default`: fallback identity for state and eval rows.
- `state_dir`: directory containing `runs/<run_id>.json`.
- `dashboard_port_base`: first localhost port to try.
- `hud_app_path`: optional Ringside app path. Omit it for browser opening.
- `allow_full_access`: required second gate for any full-access task.
- `[eval] backend`: `jsonl` or `postgres`.
- `[eval] jsonl_path`: local fallback or primary JSONL log path.
- `[eval.postgres] env_file`: optional Supabase/Postgres env file.
- `[engines.<name>]`: worker engine definition.

See `config.sample.toml` for a fully commented config.

## Engine Plugins

Engines are TOML sections:

```toml
[engines.codex]
bin = "codex"
args_template = ["exec", "--skip-git-repo-check", "{access_args}", "-C", "{taskdir}", "{spec}"]
sandbox_args = ["--sandbox", "workspace-write"]
full_access_args = ["--dangerously-bypass-approvals-and-sandbox"]
token_regex = "tokens\\s+used\\s*:?\\s*([0-9][0-9,]*)"
```

Supported placeholders:

- `{taskdir}`: task working directory.
- `{spec}`: worker prompt.
- `{access_args}`: expands to `sandbox_args` or `full_access_args`.

Add another engine by defining `[engines.grok]`, `[engines.opencode]`, or any name you want, then set `tasks[].engine` in the manifest.

## Invariants

- `stdin=DEVNULL`: workers can hang forever under non-TTY supervisors if stdin is left open.
- Explicit sandbox args: engine defaults change and can be unsafe or read-only in the wrong directory.
- Low-effort coordinator: `ringer.py` does orchestration, process control, logging, and verification; it does not judge output with another model.
- Raw-output verification: checks execute in the task directory and raw output is logged, because summaries hide the bug you need.

## Commands

```bash
./ringer.py run manifest.json [--max-parallel N] [--identity NAME] [--no-dashboard] [--browser] [--dry-run]
./ringer.py demo [--max-parallel N] [--identity NAME] [--no-dashboard] [--browser] [--dry-run]
```

The dashboard HTML lives in `dashboard/dashboard.html`. The HTTP dashboard passes one run to `update(...)`; Ringside can pass many.
