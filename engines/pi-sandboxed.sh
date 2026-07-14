#!/bin/bash
# Ringer engine wrapper: run pi (@earendil-works/pi-coding-agent) under a
# macOS Seatbelt sandbox.
#
# Pi has no OS-level sandbox of its own — it "runs with the permissions of the
# user account that starts it" (upstream docs/security.md), and its
# non-interactive modes (-p, --mode json) never show a trust or approval
# prompt. This wrapper supplies the real containment: full network and reads,
# writes confined to the task dir, a per-run scratch dir, and pi's own config
# dir (~/.pi/agent — auth, sessions, settings all live under one directory for
# pi, unlike OpenCode's three-way split).
#
# Usage (as a ringer engine bin):
#   pi-sandboxed.sh <taskdir> [--no-sandbox] <pi args...>
#
# The first argument is the task directory (pass "{taskdir}" first in
# args_template). "--no-sandbox" as the second argument skips Seatbelt entirely
# — wire it as the engine's full_access_args so ringer's allow_full_access gate
# still applies. macOS only (sandbox-exec); on other platforms only
# --no-sandbox mode works.
set -euo pipefail

TASKDIR="${1:?usage: pi-sandboxed.sh <taskdir> [--no-sandbox] <args...>}"; shift
SANDBOX=1
if [ "${1:-}" = "--no-sandbox" ]; then SANDBOX=0; shift; fi

# Resolve pi without tripping `set -e` (command -v returns nonzero when absent).
if ! PI_BIN="$(command -v pi)" || [ -z "$PI_BIN" ]; then
  echo "pi-sandboxed.sh: pi not found on PATH" >&2
  exit 127
fi

if [ "$SANDBOX" = "0" ]; then
  exec "$PI_BIN" "$@" < /dev/null
fi

if [ ! -x /usr/bin/sandbox-exec ]; then
  echo "pi-sandboxed.sh: /usr/bin/sandbox-exec not available (macOS only)." >&2
  echo "Use the engine's full-access mode (--no-sandbox) or add your own sandbox." >&2
  exit 1
fi

TASKDIR_REAL="$(cd "$TASKDIR" && pwd -P)"

# Per-run scratch root — becomes TMPDIR for pi, so we never have to open all of
# /private/tmp to the sandboxed agent. Resolve to the real path (/var/folders
# symlinks to /private/var/folders); Seatbelt subpath matching needs the
# canonical path or writes EPERM-crash.
SCRATCH="$(cd "$(mktemp -d -t ringer-pi-scratch)" && pwd -P)"
PROFILE="$(mktemp -t ringer-pi-prof)"
cleanup() { rm -rf "$SCRATCH" "$PROFILE"; }
trap cleanup EXIT

# Paths are passed to the profile via sandbox-exec -D parameters, NOT string
# interpolation — a task dir containing quotes/parens/newlines can't inject rules.
cat > "$PROFILE" <<'SBEOF'
(version 1)
(allow default)
(deny file-write*)
(allow file-write*
  (subpath (param "TASKDIR"))
  (subpath (param "SCRATCH"))
  (subpath (param "PI_AGENT_DIR")))
; /dev is needed for /dev/null, /dev/urandom, etc.; writes there can't create
; persistent files without root, so a few literals are allowed rather than via param.
(allow file-write-data
  (literal "/dev/null")
  (literal "/dev/dtracehelper")
  (literal "/dev/tty"))
SBEOF

export TMPDIR="$SCRATCH"

# Run as a child (not exec) so the EXIT trap fires and cleans up the profile +
# scratch dir even on the success path; propagate the child's exit status.
set +e
/usr/bin/sandbox-exec \
  -D "TASKDIR=$TASKDIR_REAL" \
  -D "SCRATCH=$SCRATCH" \
  -D "PI_AGENT_DIR=$HOME/.pi/agent" \
  -f "$PROFILE" "$PI_BIN" "$@" < /dev/null
status=$?
set -e
exit "$status"
