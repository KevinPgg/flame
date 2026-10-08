## PR Description
Briefly describe the changes included in this PR.

---

## Phase

Which phase does this PR belong to? (Check one)

### Phase 9: Web Design Update (Primary — see `docs/prompts/prompts_phases_web_design.md`)

- [ ] **Phase 9 (Web Design)** — Tailwind migration, mobile layout match, design tokens, CRUCIAL todos
  - [ ] I matched the **active** mobile screen layout (not LegacyHomeContent) — same sections, same order, same content.
  - [ ] Tailwind only — no CSS Module classes. No inline `style={}` unless Tailwind can't express it.
  - [ ] Flame tokens from `packages/ui/tailwind.config.js` — no hardcoded hex where a token exists.
  - [ ] Red rule: `bg-primary` / `text-primary` used ONLY on RSVP badges overlaid on event images. CTAs use `bg-white-100 text-dark`.
  - [ ] `max-w-[800px] mx-auto px-4` on all page sections.
  - [ ] No logic changes — API routes, data fetching, Stripe, Clerk auth untouched.
  - [ ] Clerk components (`<SignInButton>`, `<UserButton>`) unchanged — only surrounding wrappers restyled.
  - [ ] If this screen has a CRUCIAL todo: I implemented and crossed it off in `docs/todos/CRUCIAL_IOS_TO_WEB_TODOS.md`.
  - [ ] Old CSS deleted — selectors removed from `styles/components/*.css`; file deleted if empty; `@import` removed from `globals.css`.
  - [ ] `next/image` with `placeholder="blur"` for images. Icons via `react-icons` (FiCalendar, FiMapPin from `react-icons/fi`). No raw `<img>` or inline SVG.
  - [ ] Logged changes in `docs/fixes/MARCH_DESIGN_WEB_UPDATES.md`.

**Review reference:** Use the **PR Review Prompt** in `docs/prompts/prompts_phases_web_design.md` for full criteria and triage rules.

---

### Mobile / General (Secondary)

- [ ] **Phase 6–8 (Mobile)** — iOS polish, extra features, or testing audit fixes
  - If porting logic from web: include Web Parity Gate (Section 9.1) and relevant verification blocks.
  - **Full Phase 8 blocks:** See `.github/pull_request_template.phase4-8-backup.md` for checkout, scanner, event management, display, UX polish, registration form.

- [ ] **Other** — Bug fix, shared package (`packages/lib`), or general change.

---

## Shared Logic
- [ ] If I found business logic that should be shared but wasn't in `packages/lib`, I extracted it to `packages/lib` first.

## Testing
- [ ] Tested on target platform (Web browser / iOS Simulator).
- [ ] (If porting from web) Tested identical flow on both platforms for parity.
