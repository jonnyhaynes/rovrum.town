#!/usr/bin/env bash
#
# PreToolUse(Bash) guard -- route test runs through the project's `test` script.
#
# Running vitest/jest directly drops the project's configured flags and env. This
# hook redirects direct invocations to `<pm> test` (detecting npm/pnpm/yarn/bun from
# the lockfile). It deliberately stays out of the way when there's nothing to
# redirect to: if package.json has no "test" script, it allows the command through,
# so a fresh project is never blocked.
#
# Reads PreToolUse JSON on stdin; exits 2 with a message on stderr to block.
# Fails OPEN (exit 0) on any parse/lookup failure -- a guard should never wedge work.
#
# Don't want it? Delete this file and remove the PreToolUse block in
# .claude/settings.json.

cmd="$(python3 -c 'import sys, json; print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

dir="${CLAUDE_PROJECT_DIR:-.}"

# Already routed through a package-manager test script? Allow.
if printf '%s' "$cmd" | grep -Eq '(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?test'; then
  exit 0
fi

# Direct vitest/jest at the start of a command segment (not e.g. `grep vitest`).
runner='(\./)?(node_modules/\.bin/)?(npx[[:space:]]+)?(vitest|jest)([[:space:]]|$)'
if printf '%s' "$cmd" | grep -Eq "(^|[;&|(])[[:space:]]*${runner}"; then
  # Only redirect if a "test" script actually exists -- else there's nowhere to send it.
  has_test=$(python3 -c "import json,sys; d=json.load(open('$dir/package.json')); print('yes' if d.get('scripts',{}).get('test') else 'no')" 2>/dev/null || echo "unknown")
  [ "$has_test" != "yes" ] && exit 0

  pm="npm"
  [ -f "$dir/pnpm-lock.yaml" ] && pm="pnpm"
  [ -f "$dir/yarn.lock" ] && pm="yarn"
  [ -f "$dir/bun.lockb" ] && pm="bun"

  echo "Run tests via \`$pm test\` (uses the project's configured runner + env). Direct vitest/jest invocations are disabled in this repo." >&2
  exit 2
fi

exit 0
