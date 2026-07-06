# Rovrum Development Workflow

The repeatable process and standing conventions for building Rovrum. This
captures *how* we build; *what* to build lives in the source-of-truth docs under
`/docs`. Read the relevant sections before starting a piece of work, and flag any
change to a load-bearing decision explicitly rather than slipping it in.

---

## The loop (per ticket / unit of work)

1. **Orient** -- read the ticket and the relevant repo docs. Work on an isolated
   branch so your work doesn't collide with others'.
2. **Plan** -- have Claude produce an implementation plan and save it to
   `docs/plans/<ticket>.md`. **A human reviews and approves the plan before any code
   is written.** This is the single biggest quality lever: the plan is diffable,
   referenceable, and decoupled from any one Claude session.
3. **Backlog** -- break the approved plan into tracked work (issues / tickets), each
   item carrying its acceptance criteria as the test contract.
4. **Build** -- work the plan task by task, **test-first**: each acceptance criterion
   becomes a failing test before the implementation. Prefer a fresh Claude context
   per task -- it keeps each unit focused and reviewable. Review between tasks: does
   it match the plan, and is the code good?
5. **Review** -- run a code review across the branch. **Vet the findings; don't
   blindly apply them.** Fix the real issues and strengthen any test that passed when
   it shouldn't have.
6. **Ship** -- run lint + format, type-check (`tsc --noEmit`), and the test suite (`pnpm test`) green locally, then open a PR. CI must be green before review.
7. **Land** -- a human reviews the diff against the plan and merges. Then sync the
   main branch, delete the branch, and file any deferred follow-up work as tracked
   tickets.

Automation never moves the human gates: **plan approval (step 2) and the merge
(step 7) are always a person's decision.**

---

## Standing conventions

### Stack & tooling

- **Package manager: pnpm** (with Turborepo) — the agreed monorepo tooling. Don't
  mix in npm/yarn/bun. Commit `pnpm-lock.yaml`.
- **TypeScript.** Strict mode; avoid `any`. Type-check with `tsc --noEmit` as a CI gate.
- **Testing.** Run via the project's `test` script (Vitest / Jest behind it, with the
  right config and env). A `PreToolUse` hook redirects direct `vitest` / `jest` calls
  to that script -- but only when a `test` script exists, so it never blocks a project
  that hasn't set one up yet. Test behaviour, not implementation; a test must fail if
  the feature is removed.
- **Lint & format.** ESLint + Prettier; run green before opening a PR.

### Guardrails (`.claude/`)

- `.claude/settings.json` holds this repo's permissions and hooks. It's versioned
  and shared so the guardrails don't depend on everyone remembering.
- A `PreToolUse` hook (`.claude/hooks/guard-test-command.sh`) routes test
  runs through the project's test command so agents and humans stay on the
  same path. It fails open and is removable -- delete the file and the
  `hooks` block in `settings.json` if it gets in the way.
- Sensitive paths are deny-listed and secrets never go in the repo or the model
  (`.env`, keys, client data). Anything touching sensitive data needs an explicit OK.
- If a guardrail gets in the way for a legitimate reason, **change it in the open**
  -- don't route around it silently.

### Git & pull requests

This project uses **GitHub**. Raise PRs with the `gh` CLI (or the REST API):

- Repo: `jonnyhaynes/rovrum.town` · Target branch: `main`.
- Push the branch (`git push -u origin <branch>`), then `gh pr create`.
- **Mark AI-assisted PRs:** prefix the title `[ai-assisted]` (or add an `ai-assisted`
  label), reference the approved plan doc (`docs/plans/<ticket>.md`) in the body, and
  end it with a `Manually reviewed by <name>` line confirming the diff was read.
- Keep the `Co-Authored-By` trailer on commits. **A human merges** once CI is green
  and the diff has been reviewed against the plan.

**Issue tracker: GitHub Issues.** One issue = one unit of work; acceptance criteria
are the test contract. Reference the issue in the branch name and PR, and close it from
the PR (`Closes #NN`) once merged.

---

*This doc is the standing process. Update it when a convention genuinely changes
(and say so), rather than re-deciding per ticket.*
