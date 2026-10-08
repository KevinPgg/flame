# Legacy Documentation

This folder contains archived and historical documentation kept for reference.

## Archived Guides

- **REALTIME_RSVP_SETUP_OLD.md** - Old real-time RSVP setup (deprecated)

## Legacy Datafast Documentation

The `datafast-legacy/` folder contains pre-Stripe Datafast documentation:

### Fixes
- **[datafast-legacy/fixes/PROMOTER_CODE_SIGNUP_FIX.md](./datafast-legacy/fixes/PROMOTER_CODE_SIGNUP_FIX.md)** - Promoter code signup fix
- **[datafast-legacy/fixes/PROMO_CODE_ROUNDING_FIX.md](./datafast-legacy/fixes/PROMO_CODE_ROUNDING_FIX.md)** - Promo code rounding fix

### Pricing
- **[datafast-legacy/pricing/HISTORICAL_PRICING_FIX.md](./datafast-legacy/pricing/HISTORICAL_PRICING_FIX.md)** - Historical pricing fix
- **[datafast-legacy/pricing/PRICING_FIELDS_REFERENCE.md](./datafast-legacy/pricing/PRICING_FIELDS_REFERENCE.md)** - Pricing fields reference

## Why Keep Legacy Docs?

Legacy documentation is kept for:

1. **Historical Reference** - Understanding past decisions and implementations
2. **Bug Investigation** - Debugging issues related to legacy code
3. **Migration Context** - Understanding what was changed during migrations
4. **Learning** - Understanding evolution of the codebase

## Active Documentation

For current, active documentation see:

- [Datafast Documentation](../datafast/) - Current Datafast integration docs (legacy payment system)
- [Stripe Implementation](../../stripe-implementation/) - Current payment system
- [Fixes Documentation](../fixes/) - Current bug fixes
- [Features Documentation](../features/) - Current features

## Document Retirement Policy

Documentation should be moved to legacy when:

- ✅ The feature/system has been replaced
- ✅ The guide is no longer relevant
- ✅ A newer version of the doc exists
- ❌ It might still be needed for reference

---

**Note**: Documentation in this folder is for reference only. Do not implement solutions from legacy docs without reviewing current best practices.
