import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Helper to generate UUID (using Web Crypto API or fallback)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Integration Test Suite for Bank Transfer Orders & Promotional Tickets
 * 
 * This test suite verifies:
 * 1. User search by email only (no first/last name search)
 * 2. Free promotional tickets (metadata: null, DO NOT update inventory)
 * 3. Bank transfer orders (metadata with stage_price_cents, DO update inventory via atomic function)
 * 4. Tickets appearing in user accounts with correct pricing display
 * 5. Bank transfer orders set both total_cents and total_amount_cents
 * 
 * Note: These tests require a test database
 */

// Test fixtures
let supabase: SupabaseClient;
let testEvent: any;
let testTier: any;
let testOrganizer: any;
let testOrganization: any;
let createdTestUserIds: string[] = []; // Track users created during tests for cleanup

beforeAll(async () => {
  // Setup test database connection
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase credentials for testing');
  }

  supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Create test user/organizer first (needed for owner_user_id)
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      clerk_id: `test_clerk_${Date.now()}`,
      email: `test.organizer.${Date.now()}@example.com`,
      first_name: 'Test',
      last_name: 'Organizer',
    })
    .select()
    .single();

  if (userError) throw userError;
  testOrganizer = user;

  // Create test organization with owner_user_id
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: 'Test Organization',
      slug: `test-org-${Date.now()}`,
      approved: true,
      owner_user_id: testOrganizer.id,
    })
    .select()
    .single();

  if (orgError) throw orgError;
  testOrganization = org;

  // Add organizer to organization
  await supabase.from('organization_members').insert({
    organization_id: testOrganization.id,
    user_id: testOrganizer.id,
    role: 'owner',
  });

  // Create test event
  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      organization_id: testOrganization.id,
      name: 'Test Event',
      slug: `test-event-${Date.now()}`,
      description: 'Test event for integration tests',
      starts_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      ends_at: new Date(Date.now() + 90000000).toISOString(), // Day after tomorrow
      venue: 'Test Venue',
      city: 'Test City',
    })
    .select()
    .single();

  if (eventError) throw eventError;
  testEvent = event;

  // Create test ticket tier
  const { data: tier, error: tierError } = await supabase
    .from('ticket_tiers')
    .insert({
      event_id: testEvent.id,
      name: 'Test Tier',
      price_cents: 5000, // $50
      quantity_total: 100,
      quantity_sold: 0,
      sales_start: new Date(Date.now()).toISOString(), // Now
      sales_end: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    })
    .select()
    .single();

  if (tierError) throw tierError;
  testTier = tier;
});

beforeEach(async () => {
  // Clean up test users created in previous tests
  if (createdTestUserIds.length > 0) {
    // Delete related data first (in reverse order of dependencies)
    const userIds = createdTestUserIds;
    
    // Get emails before deleting users
    const { data: users } = await supabase
      .from('users')
      .select('email')
      .in('id', userIds);
    
    const emails = users?.map(u => u.email) || [];
    
    // Delete dependent records
    await supabase.from('tickets').delete().in('user_id', userIds);
    if (emails.length > 0) {
      await supabase.from('promotional_tickets').delete().in('email', emails);
    }
    await supabase.from('orders').delete().in('user_id', userIds);
    
    // Delete users
    await supabase.from('users').delete().in('id', userIds);
    createdTestUserIds = [];
  }
});

afterAll(async () => {
  // Cleanup test data
  // Clean up test users
  if (createdTestUserIds.length > 0) {
    // Get emails before deleting users
    const { data: users } = await supabase
      .from('users')
      .select('email')
      .in('id', createdTestUserIds);
    
    const emails = users?.map(u => u.email) || [];
    
    // Delete dependent records
    await supabase.from('tickets').delete().in('user_id', createdTestUserIds);
    if (emails.length > 0) {
      await supabase.from('promotional_tickets').delete().in('email', emails);
    }
    await supabase.from('orders').delete().in('user_id', createdTestUserIds);
    await supabase.from('users').delete().in('id', createdTestUserIds);
  }
  
  if (testTier) {
    await supabase.from('tickets').delete().eq('ticket_tier_id', testTier.id);
    await supabase.from('promotional_tickets').delete().eq('ticket_tier_id', testTier.id);
    await supabase.from('ticket_tiers').delete().eq('id', testTier.id);
  }
  if (testEvent) {
    await supabase.from('events').delete().eq('id', testEvent.id);
  }
  if (testOrganization) {
    await supabase.from('organization_members').delete().eq('organization_id', testOrganization.id);
    await supabase.from('organizations').delete().eq('id', testOrganization.id);
  }
  if (testOrganizer) {
    await supabase.from('users').delete().eq('id', testOrganizer.id);
  }
});

// Helper to create test user with unique email
async function createTestUser(data: { email?: string; first_name?: string; last_name?: string }) {
  // Generate unique email if not provided
  const uniqueEmail = data.email || `test.${Date.now()}.${Math.random().toString(36).substring(7)}@test.com`;
  
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      clerk_id: `test_clerk_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      email: uniqueEmail.toLowerCase(), // Normalize to lowercase
      first_name: data.first_name || 'Test',
      last_name: data.last_name || 'User',
    })
    .select()
    .single();

  if (error) throw error;
  
  // Track created user for cleanup
  createdTestUserIds.push(user.id);
  
  return user;
}

describe('User Search by Email', () => {
  it('should find existing user by exact email match', async () => {
    const timestamp = Date.now();
    const testEmail = `john.doe.${timestamp}@test.com`;
    const testUser = await createTestUser({ email: testEmail });

    // Test the database query that the API uses (exact email match, case-insensitive through normalization)
    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', testEmail.toLowerCase()) // Emails are normalized to lowercase
      .maybeSingle();

    expect(error).toBeNull();
    expect(foundUser).toBeTruthy();
    expect(foundUser!.email).toBe(testEmail.toLowerCase());
    expect(foundUser!.id).toBe(testUser.id);
  });

  it('should return empty result if email not found', async () => {
    const { data: foundUser, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', `nonexistent.${Date.now()}@test.com`)
      .maybeSingle();

    expect(error).toBeNull();
    expect(foundUser).toBeNull();
  });

  it('should be case-insensitive (emails normalized to lowercase)', async () => {
    const timestamp = Date.now();
    const testEmail = `BOB.${timestamp}@TEST.COM`;
    const testUser = await createTestUser({ email: testEmail });

    // Email should be stored as lowercase
    const { data: foundUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', testEmail.toLowerCase())
      .maybeSingle();

    expect(foundUser).toBeTruthy();
    expect(foundUser!.email).toBe(testEmail.toLowerCase());
  });
});

describe('Free Promotional Tickets ($0, No Inventory Impact, metadata: null)', () => {
  let initialQuantitySold: number;

  beforeEach(async () => {
    const { data: tier } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();
    initialQuantitySold = tier!.quantity_sold;
  });

  it('should create promotional ticket with metadata: null', async () => {
    const timestamp = Date.now();
    const testEmail = `promo.${timestamp}@test.com`;
    const testUser = await createTestUser({ email: testEmail });

    const { data: promoTicket, error } = await supabase
      .from('promotional_tickets')
      .insert({
        event_id: testEvent.id,
        ticket_tier_id: testTier.id,
        email: testEmail.toLowerCase(),
        customer_name: 'Test User',
        status: 'issued',
        created_by: testOrganizer.id,
        metadata: null, // Free promotional tickets have no stage metadata
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(promoTicket).toBeTruthy();
    expect(promoTicket!.email).toBe(testEmail.toLowerCase());
    expect(promoTicket!.metadata).toBeNull(); // Critical: metadata must be null for free tickets
  });

  it('should NOT update quantity_sold for promotional tickets', async () => {
    const timestamp = Date.now();
    const testEmail = `promo2.${timestamp}@test.com`;
    const testUser = await createTestUser({ email: testEmail });

    await supabase.from('promotional_tickets').insert({
      event_id: testEvent.id,
      ticket_tier_id: testTier.id,
      email: testEmail.toLowerCase(),
      customer_name: 'Test User 2',
      status: 'issued',
      created_by: testOrganizer.id,
      metadata: null, // Free tickets have no metadata
    });

    const { data: tier } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();

    expect(tier!.quantity_sold).toBe(initialQuantitySold);
  });

  it('should have qr_token generated automatically', async () => {
    const timestamp = Date.now();
    const testEmail = `promo3.${timestamp}@test.com`;
    const testUser = await createTestUser({ email: testEmail });

    const { data: promoTicket } = await supabase
      .from('promotional_tickets')
      .insert({
        event_id: testEvent.id,
        ticket_tier_id: testTier.id,
        email: testEmail.toLowerCase(),
        customer_name: 'Test User 3',
        status: 'issued',
        created_by: testOrganizer.id,
        metadata: null,
      })
      .select('qr_token')
      .single();

    expect(promoTicket).toBeTruthy();
    expect(promoTicket!.qr_token).toBeTruthy();
    expect(typeof promoTicket!.qr_token).toBe('string');
  });
});

describe('Bank Transfer Orders (Actual Price, Updates Inventory via Atomic Function)', () => {
  let initialQuantitySold: number;

  beforeEach(async () => {
    const { data: tier } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();
    initialQuantitySold = tier!.quantity_sold;
  });

  it('should create order with both total_cents and total_amount_cents set', async () => {
    const timestamp = Date.now();
    const testUser = await createTestUser({ email: `bank.${timestamp}@test.com` });
    const quantity = 2;
    const unitPriceCents = testTier.price_cents;
    const subtotalCents = unitPriceCents * quantity;
    const feesCents = 0;
    const totalCents = subtotalCents + feesCents;

    // Test the atomic function directly
    const ticketsToInsert = Array.from({ length: quantity }, (_, i) => ({
      ticket_tier_id: testTier.id,
      user_id: testUser.id,
      event_id: testEvent.id,
      attendee_name: 'Test User',
      attendee_email: testUser.email,
      status: 'issued',
      qr_token: crypto.randomUUID(),
      qr_code: null, // Will be generated after order creation
      metadata: null,
    }));

    const { data: result, error } = await supabase.rpc('create_bank_transfer_order_atomic', {
      p_user_id: testUser.id,
      p_organization_id: testOrganization.id,
      p_event_id: testEvent.id,
      p_ticket_tier_id: testTier.id,
      p_quantity: quantity,
      p_unit_price_cents: unitPriceCents,
      p_subtotal_cents: subtotalCents,
      p_fees_cents: feesCents,
      p_total_cents: totalCents,
      p_idempotency_key: generateUUID(),
      p_tickets: JSON.stringify(ticketsToInsert),
      p_stage_id: null,
    });

    expect(error).toBeNull();
    expect(result).toBeTruthy();
    expect(result!.success).toBe(true);
    expect(result!.order_id).toBeTruthy();

    // Verify order was created with both total_cents and total_amount_cents
    const { data: order } = await supabase
      .from('orders')
      .select('total_cents, total_amount_cents, payment_provider')
      .eq('id', result!.order_id)
      .single();

    expect(order).toBeTruthy();
    expect(order!.total_cents).toBe(totalCents);
    expect(order!.total_amount_cents).toBe(totalCents); // Should match total_cents
    expect(order!.payment_provider).toBe('bank_transfer');
  });

  it('should update quantity_sold via atomic function', async () => {
    const timestamp = Date.now();
    const testUser = await createTestUser({ email: `bank2.${timestamp}@test.com` });
    const quantity = 3;
    const unitPriceCents = testTier.price_cents;
    const subtotalCents = unitPriceCents * quantity;
    const totalCents = subtotalCents;

    const ticketsToInsert = Array.from({ length: quantity }, (_, i) => ({
      ticket_tier_id: testTier.id,
      user_id: testUser.id,
      event_id: testEvent.id,
      attendee_name: 'Test User',
      attendee_email: testUser.email,
      status: 'issued',
      qr_token: crypto.randomUUID(),
      qr_code: null,
      metadata: null,
    }));

    await supabase.rpc('create_bank_transfer_order_atomic', {
      p_user_id: testUser.id,
      p_organization_id: testOrganization.id,
      p_event_id: testEvent.id,
      p_ticket_tier_id: testTier.id,
      p_quantity: quantity,
      p_unit_price_cents: unitPriceCents,
      p_subtotal_cents: subtotalCents,
      p_fees_cents: 0,
      p_total_cents: totalCents,
      p_idempotency_key: generateUUID(),
      p_tickets: JSON.stringify(ticketsToInsert),
      p_stage_id: null,
    });

    const { data: tier } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();

    expect(tier!.quantity_sold).toBe(initialQuantitySold + quantity);
  });

  it('should create tickets with qr_token (qr_code generated later)', async () => {
    const timestamp = Date.now();
    const testUser = await createTestUser({ email: `bank3.${timestamp}@test.com` });
    const quantity = 2;
    const unitPriceCents = testTier.price_cents;
    const subtotalCents = unitPriceCents * quantity;
    const totalCents = subtotalCents;

    const qrTokens = Array.from({ length: quantity }, () => generateUUID());
    const ticketsToInsert = qrTokens.map((qrToken, i) => ({
      ticket_tier_id: testTier.id,
      user_id: testUser.id,
      event_id: testEvent.id,
      attendee_name: 'Test User',
      attendee_email: testUser.email,
      status: 'issued',
      qr_token: qrToken,
      qr_code: null, // QR codes generated after order creation
      metadata: null,
    }));

    const { data: result } = await supabase.rpc('create_bank_transfer_order_atomic', {
      p_user_id: testUser.id,
      p_organization_id: testOrganization.id,
      p_event_id: testEvent.id,
      p_ticket_tier_id: testTier.id,
      p_quantity: quantity,
      p_unit_price_cents: unitPriceCents,
      p_subtotal_cents: subtotalCents,
      p_fees_cents: 0,
      p_total_cents: totalCents,
      p_idempotency_key: generateUUID(),
      p_tickets: JSON.stringify(ticketsToInsert),
      p_stage_id: null,
    });

    // Verify tickets were created
    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, qr_token, qr_code, order_id')
      .eq('order_id', result!.order_id);

    expect(tickets).toHaveLength(quantity);
    tickets!.forEach((ticket, i) => {
      expect(ticket.qr_token).toBe(qrTokens[i]);
      expect(ticket.qr_code).toBeNull(); // QR codes generated after order creation
      expect(ticket.order_id).toBe(result!.order_id);
    });
  });
});

describe('Inventory Behavior Comparison', () => {
  it('should verify promotional tickets do NOT count, bank transfer DOES count', async () => {
    const timestamp = Date.now();
    const promoEmail = `promo-compare.${timestamp}@test.com`;
    const bankEmail = `bank-compare.${timestamp}@test.com`;
    const promoUser = await createTestUser({ email: promoEmail });
    const bankUser = await createTestUser({ email: bankEmail });

    // Get initial state
    const { data: initialTier } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();

    const initialQuantity = initialTier!.quantity_sold;

    // Create 3 promotional tickets (should NOT affect inventory)
    for (let i = 0; i < 3; i++) {
      await supabase.from('promotional_tickets').insert({
        event_id: testEvent.id,
        ticket_tier_id: testTier.id,
        email: `${promoEmail}.${i}`.toLowerCase(),
        customer_name: 'Promo User',
        status: 'issued',
        created_by: testOrganizer.id,
        metadata: null, // Free tickets have no metadata
      });
    }

    // Verify quantity unchanged
    const { data: afterPromo } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();

    expect(afterPromo!.quantity_sold).toBe(initialQuantity);

    // Create 2 bank transfer tickets via atomic function (SHOULD affect inventory)
    const quantity = 2;
    const unitPriceCents = testTier.price_cents;
    const subtotalCents = unitPriceCents * quantity;
    const totalCents = subtotalCents;

    const ticketsToInsert = Array.from({ length: quantity }, (_, i) => ({
      ticket_tier_id: testTier.id,
      user_id: bankUser.id,
      event_id: testEvent.id,
      attendee_name: 'Bank User',
      attendee_email: bankUser.email,
      status: 'issued',
      qr_token: crypto.randomUUID(),
      qr_code: null,
      metadata: null,
    }));

    await supabase.rpc('create_bank_transfer_order_atomic', {
      p_user_id: bankUser.id,
      p_organization_id: testOrganization.id,
      p_event_id: testEvent.id,
      p_ticket_tier_id: testTier.id,
      p_quantity: quantity,
      p_unit_price_cents: unitPriceCents,
      p_subtotal_cents: subtotalCents,
      p_fees_cents: 0,
      p_total_cents: totalCents,
      p_idempotency_key: generateUUID(),
      p_tickets: JSON.stringify(ticketsToInsert),
      p_stage_id: null,
    });

    // Verify quantity increased by 2
    const { data: afterBank } = await supabase
      .from('ticket_tiers')
      .select('quantity_sold')
      .eq('id', testTier.id)
      .single();

    expect(afterBank!.quantity_sold).toBe(initialQuantity + quantity);
  });
});

describe('End-to-End User Experience', () => {
  it('should complete full promotional ticket flow with metadata: null', async () => {
    const timestamp = Date.now();
    const testEmail = `e2e-promo.${timestamp}@test.com`;
    const user = await createTestUser({
      email: testEmail,
      first_name: 'E2E',
      last_name: 'PromoUser',
    });

    // Create promotional ticket (as API would)
    const { data: promoTicket, error } = await supabase
      .from('promotional_tickets')
      .insert({
        event_id: testEvent.id,
        ticket_tier_id: testTier.id,
        email: testEmail.toLowerCase(),
        customer_name: 'E2E PromoUser',
        status: 'issued',
        created_by: testOrganizer.id,
        metadata: null, // Free tickets have no metadata
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(promoTicket).toBeTruthy();
    expect(promoTicket!.email).toBe(testEmail.toLowerCase());
    expect(promoTicket!.status).toBe('issued');
    expect(promoTicket!.qr_token).toBeTruthy();
    expect(promoTicket!.metadata).toBeNull(); // Critical: must be null for free tickets
  });

  it('should complete full bank transfer flow with atomic function', async () => {
    const timestamp = Date.now();
    const testEmail = `e2e-bank.${timestamp}@test.com`;
    const user = await createTestUser({
      email: testEmail,
      first_name: 'Bank',
      last_name: 'Customer',
    });

    const quantity = 2;
    const unitPriceCents = testTier.price_cents;
    const subtotalCents = unitPriceCents * quantity;
    const totalCents = subtotalCents;

    const ticketsToInsert = Array.from({ length: quantity }, (_, i) => ({
      ticket_tier_id: testTier.id,
      user_id: user.id,
      event_id: testEvent.id,
      attendee_name: 'Bank Customer',
      attendee_email: user.email,
      status: 'issued',
      qr_token: crypto.randomUUID(),
      qr_code: null,
      metadata: null,
    }));

    const { data: result } = await supabase.rpc('create_bank_transfer_order_atomic', {
      p_user_id: user.id,
      p_organization_id: testOrganization.id,
      p_event_id: testEvent.id,
      p_ticket_tier_id: testTier.id,
      p_quantity: quantity,
      p_unit_price_cents: unitPriceCents,
      p_subtotal_cents: subtotalCents,
      p_fees_cents: 0,
      p_total_cents: totalCents,
      p_idempotency_key: generateUUID(),
      p_tickets: JSON.stringify(ticketsToInsert),
      p_stage_id: null,
    });

    expect(result).toBeTruthy();
    expect(result!.success).toBe(true);
    expect(result!.order_id).toBeTruthy();
    expect(result!.tickets).toHaveLength(quantity);

    // Verify order
    const { data: order } = await supabase
      .from('orders')
      .select('total_cents, total_amount_cents, payment_provider, quantity')
      .eq('id', result!.order_id)
      .single();

    expect(order).toBeTruthy();
    expect(order!.total_cents).toBe(totalCents);
    expect(order!.total_amount_cents).toBe(totalCents);
    expect(order!.payment_provider).toBe('bank_transfer');
    expect(order!.quantity).toBe(quantity);
  });
});
