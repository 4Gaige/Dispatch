#!/usr/bin/env bash
# Spawns an Opus session to clear docs/follow-ups.md via grouped PRs.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

REPO=/Users/home/src/Dispatch
WT=/Users/home/src/Dispatch-wt-followups
BRANCH=polish/followups-coordinator
LOG=/tmp/dispatch-followups.log

notify_log info "🧹 Follow-ups opus starting at $(date)"

if [[ ! -d "$WT" ]]; then
  git -C "$REPO" fetch origin main --quiet
  git -C "$REPO" branch -D "$BRANCH" 2>/dev/null
  if ! git -C "$REPO" worktree add -B "$BRANCH" "$WT" origin/main 2>>"$BUILD_LOG"; then
    notify_log error "Followups: worktree create failed"
    exit 1
  fi
fi

cd "$WT"
if [[ ! -d node_modules ]] || [[ "package.json" -nt node_modules/.package-lock.json ]]; then
  notify_log info "Followups: npm install"
  npm install --silent >>"$BUILD_LOG" 2>&1 || notify_log warn "Followups: npm install warnings"
fi

PROMPT=$(cat <<EOF
You are the autonomous follow-ups implementer for Dispatch. Read and follow exactly:
  /Users/home/src/Dispatch/docs/CLAUDE.md
  /Users/home/src/Dispatch/docs/followups-brief.md
  /Users/home/src/Dispatch/docs/follow-ups.md

You work in ${WT}. For each PR (A, B, C, optional D), create a fresh branch from origin/main,
implement, review, merge, auto-deploy will redeploy dispatch.forgeurfuture.com.

Use extended thinking + delegate heavily (Haiku for scan, Sonnet for impl, Opus for design calls).
iMessage at each PR merge via /Users/home/src/Dispatch/scripts/notify.sh.

Go.
EOF
)

claude \
  --model opus \
  --effort max \
  --permission-mode bypassPermissions \
  --add-dir /Users/home/src/Dispatch \
  --fallback-model sonnet \
  --output-format text \
  -p "$PROMPT" \
  >> "$LOG" 2>&1

EXIT_CODE=$?
notify_log info "Follow-ups opus exited $EXIT_CODE"

if [[ $EXIT_CODE -eq 0 ]]; then
  "$HERE/notify.sh" "🧹 Follow-ups opus finished. Check PRs at github.com/4Gaige/Dispatch/pulls"
else
  "$HERE/notify.sh" "⚠️ Follow-ups opus exited $EXIT_CODE — see $LOG"
fi
