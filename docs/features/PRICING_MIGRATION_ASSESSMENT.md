# Pricing Migration Assessment

## Question: Do We Need a Database Migration?

**Short answer: NO migration needed** ✅

Here's why:

## Current Database State

The `ticket_tiers` table has:

- `price_cents` column (integer) - stores the price in cents

This column **already stores the final customer price** (what the customer pays).

## What Changed

### Before This Update

- Organizers entered price → System stored it directly in `price_cents`
- **Assumption**: Organizers were entering the final customer price
- No automatic markup/fee calculation

### After This Update

- Organizers enter their desired revenue → System calculates final price → Stores in `price_cents`
- **Assumption**: Organizers enter what they want to receive, system adds fees
- Automatic 10% markup + 15% IVA calculation

## Compatibility Analysis

### Scenario 1: Brand New Tickets (After Deployment)

✅ **Works perfectly**

- Organizer enters: $100
- System stores: 11150 cents ($111.50)
- Customer pays: $111.50
- Organizer gets: $100 (after Flame takes $11.50)

### Scenario 2: Existing Tickets (Created Before Deployment)

✅ **Still works, but needs clarification**

**Example**: Existing tier with `price_cents: 10000` ($100)

**When editing:**

1. System calls `extractBasePrice(10000)`
2. Calculates: $100 / 1.115 = $89.69
3. Shows organizer: "Your ticket price: $89.69"
4. Shows: "Customer will pay: $100.00"

**This reveals the breakdown:**

- If organizer is happy with customers paying $100, they see they're actually getting $89.69
- If they want to get $100, they need to update to $100 input (which becomes $111.50 customer price)

## Migration Decision: NOT NEEDED

### Why No Migration Required

1. **No data corruption**: Existing `price_cents` values are still valid
2. **Backward compatible**: Old prices still work for customers
3. **Self-correcting**: When organizers edit tiers, they'll see the true breakdown
4. **Optional adjustment**: Organizers can choose to update prices or keep them as-is

### What Organizers Will Experience

**For existing tiers:**

```
Original entry: $100 (they thought customers would pay $100)
On edit: Shows "Your price: $89.69" → "Customer pays: $100.00"

Options:
A) Keep it: Customers still pay $100, organizer gets $89.69
B) Update it: Enter $100 to get $111.50 customer price
```

This is actually **beneficial** because it reveals the true economics.

## Communication Plan

### To Existing Organizers

Send email:

```
Subject: Improved Ticket Pricing - Action Optional

Hi [Organizer],

We've improved how ticket pricing works on Flame!

What's New:
• Clearer breakdown of what YOU receive vs. what customers pay
• Automatic calculation of service fees and taxes
• More transparent pricing for everyone

Your Existing Events:
• All current prices remain unchanged
• Customers will pay the same amounts
• When you edit a tier, you'll see the full breakdown

Optional: Review Your Prices
You may want to review your existing ticket prices to ensure
you're receiving the amount you intended. The new interface
shows exactly what you'll receive after fees.

Questions? Contact support@flame.com
```

## Testing Scenarios

Before deployment, test these cases:

### Test 1: New Tier Creation

- [ ] Create tier with base price $100
- [ ] Verify `price_cents` = 11150
- [ ] Verify customer sees $111.50
- [ ] Verify breakdown shows correctly

### Test 2: Editing Existing Tier (No stages)

- [ ] Create tier directly in DB with `price_cents: 10000`
- [ ] Open for editing
- [ ] Verify shows base price $89.69
- [ ] Verify breakdown shows customer pays $100
- [ ] Change to $100, verify stores 11150

### Test 3: Editing Existing Tier (With stages)

- [ ] Create tier with stages in DB
- [ ] Open for editing
- [ ] Verify each stage shows correct base price
- [ ] Verify can edit and save

### Test 4: Free Tickets

- [ ] Create/edit free tier ($0)
- [ ] Verify no breakdown shown
- [ ] Verify stores as 0

## Edge Cases

### Edge Case 1: Organizer Created Free Tier Before

`price_cents: 0` → Shows $0, no breakdown ✅

### Edge Case 2: Very Low Prices

`price_cents: 115` ($1.15) → Shows base ~$1.03 ✅

### Edge Case 3: Very High Prices

`price_cents: 100000` ($1000) → Shows base ~$896.86 ✅

All mathematically correct!

## Rollback Plan

If issues arise:

1. **Keep database unchanged** (no migration means easy rollback)
2. **Revert code changes** to previous version
3. **Prices remain intact** in database

## Alternative: Optional Migration Script

If you want to **optionally** recalculate existing prices (not recommended):

```sql
-- OPTIONAL: Recalculate existing prices to include markup
-- WARNING: This changes what customers pay!
-- Only run if organizers were expecting markup to be added

UPDATE ticket_tiers
SET price_cents = ROUND(price_cents * 1.115)
WHERE price_cents > 0;

UPDATE ticket_stages
SET price_cents = ROUND(price_cents * 1.115)
WHERE price_cents > 0;
```

**⚠️ DON'T run this unless you're sure organizers expected fees to be added!**

Most likely, they entered final prices, so no adjustment needed.

## Recommendation

### ✅ Deploy Without Migration

**Reasoning:**

1. Existing prices are correct (customer-facing amounts)
2. Edit interface reveals true breakdown to organizers
3. Organizers can adjust if they want different economics
4. No risk of breaking existing ticketing
5. Customers see no change for existing events

### ✅ Monitor & Support

After deployment:

1. Monitor support tickets about pricing questions
2. Be ready to explain the new breakdown
3. Help organizers adjust prices if needed
4. Collect feedback on the new UX

## Conclusion

**No database migration required.** ✅

The pricing change is:

- **Backward compatible**
- **Self-documenting** (shows breakdown on edit)
- **Optional** (organizers can adjust or not)
- **Safe** (no data changes)
- **Transparent** (reveals true economics)

Deploy with confidence! 🚀
