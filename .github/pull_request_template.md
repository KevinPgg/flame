## PR Description
Briefly describe the changes included in this PR.

---

## Category

Which category does this PR belong to? (Check one)

### Reviews & Fixes (Primary)

- [ ] **Bug fix / Production fix** — Fixes a verified bug or production issue
  - [ ] Root cause identified and documented in PR description.
  - [ ] Fix logged in the active changelog (`docs/fixes/APRIL_2026_FIXES.md`).
  - [ ] If fix touches auth/navigation flow: tested on both dev (Metro) and production (TestFlight/EAS) builds.

- [ ] **PR review fix** — Addresses findings from automated or manual PR review
  - [ ] Each comment triaged (fixed, deferred, or skipped with reason) per `docs/prompts/starter-pr-prompt.md`.
  - [ ] Deferred items logged in the correct todo file (`EDGE_CASES_TODOS.md`, `ACCESSIBILITY_TODOS.md`, or `NITPICKS_TODOS.md`).
  - [ ] Fix logged in the active changelog.

- [ ] **Refactor / Code quality** — Cleanup, dead code removal, or structural improvement
  - [ ] No behavior change (or behavior change explicitly called out).
  - [ ] Logged in changelog if non-trivial.

---

### Mobile / General (Secondary)

- [ ] **New feature** — New user-facing functionality
  - [ ] If this feature has a web equivalent: followed the Logic Porting Protocol and Web Parity Gate (Section 9.1 in `project-flame-master.mdc`).
  - [ ] If mobile-only: added entry to `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`.

- [ ] **Other** — Shared package (`packages/lib`), docs, CI, or general change.

---

## Shared Logic
- [ ] If I found business logic that should be shared but wasn't in `packages/lib`, I extracted it to `packages/lib` first.

## Testing
- [ ] Tested on target platform (Web browser / iOS Simulator).
- [ ] (If porting from web) Tested identical flow on both platforms for parity.

## Production Build (check if applicable)
- [ ] **TestFlight / EAS build required** — This PR changes auth, navigation, native modules, or `app.json` config.
  - [ ] Verified the fix works in a production standalone build (not just Metro dev).
  - [ ] Confirmed no regression on cold launch, sign-in, sign-out, and tab navigation.
