-- Migration: Create promotional system tables
-- Description: Add tables for promotional tickets and promotional codes

-- Create promotional_tickets table
CREATE TABLE IF NOT EXISTS public.promotional_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  qr_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status VARCHAR(50) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void', 'checked_in')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ,
  checked_in_device_id VARCHAR(255),
  metadata JSONB
);

-- Create indexes for promotional_tickets
CREATE INDEX idx_promotional_tickets_event_id ON public.promotional_tickets(event_id);
CREATE INDEX idx_promotional_tickets_qr_token ON public.promotional_tickets(qr_token);
CREATE INDEX idx_promotional_tickets_created_by ON public.promotional_tickets(created_by);
CREATE INDEX idx_promotional_tickets_status ON public.promotional_tickets(status);

-- Create case-insensitive unique index on event_id and email
-- This enforces uniqueness ignoring case (e.g., "Test@Example.com" and "test@example.com" are considered duplicates)
-- NULL emails are allowed and not considered duplicates
CREATE UNIQUE INDEX idx_promotional_tickets_unique_event_email 
ON public.promotional_tickets(event_id, LOWER(email));

-- Create promotional_codes table
CREATE TABLE IF NOT EXISTS public.promotional_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  discount_percentage INTEGER NOT NULL CHECK (discount_percentage >= 5 AND discount_percentage <= 100 AND discount_percentage % 5 = 0),
  usage_limit INTEGER NOT NULL CHECK (usage_limit > 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Create case-insensitive unique index on event_id and code
-- This enforces uniqueness ignoring case (e.g., "PROMO10" and "promo10" are considered duplicates)
CREATE UNIQUE INDEX idx_promotional_codes_unique_event_code ON public.promotional_codes(event_id, LOWER(code));

-- Create indexes for promotional_codes
CREATE INDEX idx_promotional_codes_event_id ON public.promotional_codes(event_id);
CREATE INDEX idx_promotional_codes_code ON public.promotional_codes(code);
CREATE INDEX idx_promotional_codes_created_by ON public.promotional_codes(created_by);

-- Add promotional code fields to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS promotional_code_id UUID REFERENCES public.promotional_codes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER CHECK (discount_amount_cents >= 0);

-- Create index for orders promotional_code_id
CREATE INDEX IF NOT EXISTS idx_orders_promotional_code_id ON public.orders(promotional_code_id);

-- Enable Row Level Security on promotional_tickets
ALTER TABLE public.promotional_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotional_tickets
-- Allow organizers to view promotional tickets for their events
CREATE POLICY "Organizers can view promotional tickets for their events"
ON public.promotional_tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_tickets.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow organizers to create promotional tickets for their events
CREATE POLICY "Organizers can create promotional tickets for their events"
ON public.promotional_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_tickets.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow organizers to update promotional tickets for their events
CREATE POLICY "Organizers can update promotional tickets for their events"
ON public.promotional_tickets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_tickets.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow promotional ticket holders to view their own tickets by email
CREATE POLICY "Users can view their own promotional tickets by email"
ON public.promotional_tickets
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM public.users WHERE id = auth.uid())
);

-- Enable Row Level Security on promotional_codes
ALTER TABLE public.promotional_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotional_codes
-- Allow organizers to view promotional codes for their events
CREATE POLICY "Organizers can view promotional codes for their events"
ON public.promotional_codes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_codes.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow organizers to create promotional codes for their events
CREATE POLICY "Organizers can create promotional codes for their events"
ON public.promotional_codes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_codes.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow organizers to delete promotional codes for their events
CREATE POLICY "Organizers can delete promotional codes for their events"
ON public.promotional_codes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_codes.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow organizers to update promotional codes (usage_count) for their events
CREATE POLICY "Organizers can update promotional codes for their events"
ON public.promotional_codes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    INNER JOIN public.organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = promotional_codes.event_id
    AND om.user_id = auth.uid()
  )
);

-- Allow anyone to view promotional codes for published events (for validation during purchase)
CREATE POLICY "Anyone can view promotional codes for published events"
ON public.promotional_codes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = promotional_codes.event_id
    AND e.status = 'published'
  )
);

-- Add comment to tables
COMMENT ON TABLE public.promotional_tickets IS 'Stores free promotional tickets sent by organizers to promoters/VIPs';
COMMENT ON TABLE public.promotional_codes IS 'Stores promotional discount codes for events with usage limits';

