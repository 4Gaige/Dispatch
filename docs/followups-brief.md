# Follow-ups implementation brief

You are an autonomous implementer. Clear every item in `docs/follow-ups.md` (17 total)
via a series of focused PRs to `main`. Auto-deploy picks up each merge automatically,
so each PR goes live on `dispatch.forgeurfuture.com` within ~3 minutes of merging.

## Constraints (all from CLAUDE.md, applies here too)
- Never edit `server/projects.js`, `server/index.js`, `src/components/sidebar/subcomponents/SidebarProjectItem.tsx` beyond single require/import lines. Wrap in new files.
- Never raw Tailwind color classes — Midnight-mapped semantic vars only.
- Mobile-first at 375×812; then desktop.
- Commit subjects lowercase after type (e.g. `feat: …` not `feat: Add …`), body lines ≤ 100 chars.
- Every new class must be in the Midnight catalog (`docs/midnight/README.md`).

## Suggested PR groupings
You have discretion to split differently, but this grouping keeps each PR small and reviewable.

**PR A — Accessibility & UX polish** (~1 hr)
- [ ] Phase 1: `MobileSidebarSheet` initial focus on open
- [ ] Phase 1: drag-handle hit area ≥ 44px
- [ ] Phase 1: `visualViewport` scroll listener + cleanup when `vv` undefined
- [ ] Phase 2: `prompt`/`confirm` → inline editable chip + `.ds-*` modal for topic rename/delete
- [ ] Phase 2: mobile search-scope segment uses `.ds-segment`
- [ ] Phase 2: drop `aria-labelledby` when no group header renders
- [ ] Phase 2: `crypto.randomUUID` fallback for insecure contexts

**PR B — Backend robustness** (~1 hr)
- [ ] Phase 3: titler `signalUpdate` double-trigger — write-then-ignore-next flag
- [ ] Phase 3: re-resolve `ANTHROPIC_API_KEY` per `callHaiku` invocation
- [ ] Phase 4: `useServerTopics.ts` drop `.catch()` double-fetch (keep `.finally`)
- [ ] Phase 4: wire `topic-clusterer-cron` `stop()` into SIGTERM/SIGINT
- [ ] Phase 4: add `COSINE_THRESHOLD=0.62` tuning note with evidence
- [ ] Phase 5: `SpawnSubAgentButton` narrow SSE event type via `switch`
- [ ] Phase 5: `spawn-sub-agent` MCP hard timeout + byte cap
- [ ] Phase 5: `preview-proxy` CSP/X-Frame strip gated to non-production + port allowlist

**PR C — Layout & performance** (~1.5 hr)
- [ ] Phase 1: Tasks slot in primary nav — add as sixth slot OR keep floating-only and document the decision in `useAppNavItems.ts` comment
- [ ] Phase 5: resizable Tasks aside (desktop)
- [ ] Phase 5: `SessionFilesTouchedChips` min-height to prevent layout shift
- [ ] Phase 2: repo-grouper cache — add TTL (15 min) or git-mtime invalidation
- [ ] Phase 5: `/api/worktrees/active-sessions` endpoint + `SessionActivityProvider` integration for cross-worktree dot lighting
- [ ] Cross: code-split — lazy-load Preview/Browser/Tasks panes; split CodeMirror + xterm chunks
- [ ] Cross: add `npm test` (Vitest) with smoke tests for preview-proxy allowlist, mcp-bootstrap workingDir validation, tasks path traversal

**PR D — HDBSCAN-proper** (optional, skippable)
- [ ] Phase 4: swap HDBSCAN-lite for `hdbscan-ts` (npm) or Python shell-out. If you judge current quality is fine and observed clusters look coherent, note that in `topic-clusterer.js` header comment and skip. **Only implement if clearly needed.**

## Workflow per PR
1. `git checkout -b polish/<pr-letter>-<short-desc>` from `origin/main`
2. Implement items, commit incrementally (`fix:` / `feat:` / `perf:` / `refactor:`)
3. Run `npm run build` — must succeed, bundle delta ≤ 5% (except PR C where shrinkage is expected)
4. Run `npm run dev` briefly, click through the app on mobile + desktop viewports via Playwright; save screenshots to `docs/screenshots/followups-<letter>/`
5. Spawn fresh-eyes Opus reviewer — same checklist as CLAUDE.md review checklist. Fix until YES.
6. `git push -u origin <branch>` → `gh pr create` with structured body (items checked off, screenshots, any deferred items)
7. `gh pr merge --auto --squash --delete-branch`
8. Wait for merge; send iMessage: `notify.sh "✅ PR <X> merged: <subject>"`
9. Proceed to next PR

## Delegation
- Haiku subs for grep/read/scan/format.
- Sonnet subs for implementation and tests.
- Opus subs for design judgment (e.g. "Tasks in nav vs. floating", HDBSCAN decision) and fresh-eyes review.

## Safety
- Auto-deploy redeploys after each merge. If your PR breaks the site, dispatch.forgeurfuture.com goes down. Test thoroughly before merging.
- If a PR's CI fails, fix and re-push; don't force-merge.
- If any single item turns out to be ≥ 2 hours of work, cut it from this pass and append to `docs/follow-ups.md` with a note explaining why.

## Success
All 17 items either merged or explicitly deferred in docs. Final iMessage: `"🏁 Follow-ups complete — <N> items shipped, <M> deferred with notes."`

Go.
