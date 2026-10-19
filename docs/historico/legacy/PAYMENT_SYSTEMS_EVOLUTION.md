# Payment Systems Evolution

**Last Updated**: January 16, 2026

## Overview

Project Flame currently supports **two payment systems** that coexist:

1. **Stripe Connect** (Primary) - New transactions
2. **Datafast** (Legacy) - Existing transactions and fallback

## Timeline

### Phase 1: Datafast Only (Pre-Jan 2026)
- ✅ Datafast payment gateway
- ✅ 10% markup + 15% IVA pricing model
- ✅ Bank transfer support
- ✅ Ecuador-specific payment methods

### Phase 2: Stripe Migration (Jan 2026)
- ✅ Stripe Connect implementation
- ✅ Guaranteed Net pricing model (12.5% + $0.30)
- ✅ International card support
- ✅ Auth & Capture for RSVP protection
- ✅ Automatic payouts to organizers
- ⏳ Datafast maintained for legacy support

### Phase 3: Dual System (Current - Jan 2026)
- ✅ **New events**: Use Stripe
- ✅ **Legacy events**: Continue using Datafast
- ✅ **Both systems**: Fully supported
- ✅ **Dashboard**: Shows revenue from both

## Current State (January 2026)

### Stripe (Primary)
**Status**: ✅ Production  
**Use For**: All new events and transactions  
**Documentation**: [`stripe-implementation/`](../stripe-implementation/)

**Features**:
- International payments
- Stripe Connect Express accounts
- Guaranteed Net pricing (organizer gets exact base price)
- Auth & Capture (RSVP protection)
- Automatic transfers to organizers
- Comprehensive webhook handling

### Datafast (Legacy)
**Status**: ✅ Production (Maintenance Mode)  
**Use For**: Existing transactions, legacy events  
**Documentation**: [`docs/historico/datafast/`](./datafast/)

**Features**:
- Ecuador-specific payment methods
- Bank transfer support
- Legacy pricing model (10% + IVA)
- Transaction tracking
- Manual reconciliation

## Which System to Use?

### For Developers

```typescript
// ✅ New features: Use Stripe
import { stripe } from '@/lib/stripe';

// ✅ Legacy support: Datafast still works
// (but don't add new Datafast features)
```

### For Organizers

| Scenario | System | Why |
|----------|--------|-----|
| **New event** | Stripe | Better features, international support |
| **Existing event** | Current system | Don't change mid-event |
| **International audience** | Stripe | Supports all card types |
| **Ecuador only** | Either | Both work |

## Pricing Models Comparison

### Stripe (Current)
```text
Ticket Base Price:        $100.00
Platform Markup:          $12.50  (12.5%)
Fixed Fee:                $0.30
---------------------------------
Customer Pays:            $112.80
Organizer Receives:       $100.00 (Guaranteed)
Platform Profit:          $12.80 - Stripe fees
```

### Datafast (Legacy)
```text
Ticket Base Price:        $100.00
Platform Fee:             $10.00  (10%)
IVA on Fee:               $1.50   (15% of fee)
---------------------------------
Customer Pays:            $111.50
Organizer Receives:       $100.00
Platform Profit:          $11.50 - Datafast fees
```

## Database Schema

Both systems use the same `orders` table with different fields:

```sql
-- Stripe orders
stripe_payment_intent_id   -- Stripe PI ID
base_price_cents           -- Guaranteed Net base price
markup_percent             -- 12.5
markup_fixed_cents         -- 30
payment_provider: 'stripe'
status: 'paid'

-- Datafast orders  
datafast_transaction_id    -- Datafast TX ID
fee_percentage             -- 10.0
payment_provider: 'datafast'
status: 'completed'
```

## Revenue Calculation

The organizer dashboard correctly handles both systems:

```typescript
// Stripe: Use stored base_price_cents (Guaranteed Net)
if (order.base_price_cents !== null) {
  revenue += order.base_price_cents;
}
// Datafast: Extract from total using historical rates
else {
  revenue += extractBasePriceHistorical(
    order.total_amount_cents,
    order.created_at,
    order.fee_percentage
  );
}
```

See: [`docs/historico/fixes/ORGANIZER_DASHBOARD_REVENUE_FIX.md`](./fixes/ORGANIZER_DASHBOARD_REVENUE_FIX.md)

## Documentation Structure

```
docs/
├── datafast/              # Legacy Datafast docs
│   ├── README.md
│   └── *.md              # Implementation guides
├── legacy/
│   └── datafast-legacy/  # Pre-Stripe Datafast docs
└── ...

stripe-implementation/     # Current Stripe docs (separate folder)
├── README.md
├── guides/
├── pricing/
└── security/
```

## Migration Strategy

### No Forced Migration
- ✅ Both systems work indefinitely
- ✅ No need to migrate existing events
- ✅ Organizers choose for new events

### Natural Transition
- New events default to Stripe
- Legacy events continue on Datafast
- Gradual shift as old events complete

## Support & Maintenance

### Stripe (Active Development)
- ✅ New features added
- ✅ Active bug fixes
- ✅ Performance optimizations
- ✅ Feature requests accepted

### Datafast (Maintenance Only)
- ✅ Bug fixes for critical issues
- ✅ Security patches
- ❌ No new features
- ⚠️ Minimal changes

## Common Questions

### Q: Why keep both systems?
**A**: Stability. Don't disrupt existing events mid-transaction.

### Q: When will Datafast be removed?
**A**: No timeline. It will be phased out naturally as events complete.

### Q: Can I switch an event from Datafast to Stripe?
**A**: Not recommended mid-event. Start new events on Stripe.

### Q: Which system is more profitable?
**A**: Stripe (12.5% vs 10%) but covers higher processing fees.

### Q: Do customers see a difference?
**A**: No. Both provide tickets and QR codes the same way.

## Technical References

### Stripe Implementation
- [Main Documentation](../stripe-implementation/README.md)
- [Stripe Goals](../stripe-implementation/stripe_goals.md)
- [Implementation Verification](../stripe-implementation/STRIPE_IMPLEMENTATION_VERIFICATION.md)

### Datafast Implementation
- [Datafast Documentation](./datafast/README.md)
- [Legacy Datafast Docs](./legacy/datafast-legacy/)

### Revenue & Pricing
- [Organizer Dashboard Fix](./fixes/ORGANIZER_DASHBOARD_REVENUE_FIX.md)
- [Pricing Implementation](./features/PRICING_IMPLEMENTATION_COMPLETE.md)

---

**Status**: Both systems active and supported  
**Primary**: Stripe for new transactions  
**Legacy**: Datafast for existing transactions  
**Next Review**: Q2 2026
