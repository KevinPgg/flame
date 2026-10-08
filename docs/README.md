# Project Flame Documentation

Welcome to the Project Flame documentation! This directory contains all technical documentation, guides, and references for the project.

## 📂 Documentation Structure

### `/fixes` — Bug Fixes & Patches
Monthly fix changelogs (`<MONTH>_<YEAR>_FIXES.md`) and one-off fix write-ups. These are cross-referenced from the Cursor rules and are the project's running history of behavior changes.

### `/features` — Feature Implementations
Guides for major features including promoter tracking, pricing system, free tickets, and UI improvements.

### `/security` — Security Documentation
Security reviews, patches, and implementation guides covering QR code security, storage security, and RLS.

### `/project-migrations` — Database & System Migrations
Migration guides and verification docs, including the iOS/monorepo migration (`IOS_MIGRATION.md`).

### `/testing` — Testing Documentation
Test suites, testing guides, coverage reports, and testing environment setup.

### `/guides` — General Guides
How-to guides, setup instructions, performance optimization, SEO, and general development documentation.

### `/datafast` — Datafast Integration (legacy)
Datafast payment integration documentation (legacy payment gateway used before Stripe).

### `/legacy` — Archived Documentation
Older documentation kept for historical reference, including pre-Stripe fixes and the payment systems evolution.

### `/ios-versions` — iOS Release Notes
Per-version changelogs for the mobile app releases.

### `/maintenance` — Maintenance
Operational/maintenance runbooks and notes.

### `/todos` — Deferred Work Trackers
Triaged backlog: accessibility, nitpicks, edge cases, and iOS→web parity items (per the PR triage protocol).

## 🚀 Quick Links

- [Main README](../README.md) - Project overview & setup
- [Platform overview (stakeholders)](./FLAME_PLATFORM_OVERVIEW.md) - Web + iOS capabilities summary
- [iOS / Monorepo migration](./project-migrations/IOS_MIGRATION.md) - Mobile architecture
- [Testing Guide](./testing/TESTING_GUIDE.md) - How to run tests
- [Stripe Implementation](../apps/web/stripe-implementation/README.md) - Stripe Connect docs

## 📝 Documentation Standards

When adding new documentation:

1. **Use clear, descriptive names** - `FEATURE_NAME_IMPLEMENTATION.md`
2. **Include dates** for time-sensitive docs - `JAN_16_2026_FIX_NAME.md`
3. **Put in the right folder** - See structure above
4. **Update this README** if adding new major sections

## 🔍 Finding Documentation

- **Bug fixes**: Check `/fixes` folder
- **New features**: Check `/features` folder
- **How-to guides**: Check `/guides` folder
- **Testing**: Check `/testing` folder
- **Old docs**: Check `/legacy` folder

---

**Last Updated**: July 3, 2026
