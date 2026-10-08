-- Add UNIQUE constraint to events table for qr_scanner_code
ALTER TABLE public.events
ADD CONSTRAINT events_qr_scanner_code_unique UNIQUE (qr_scanner_code);
