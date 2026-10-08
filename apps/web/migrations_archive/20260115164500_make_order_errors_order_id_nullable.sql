-- Migration: Make order_id nullable in order_errors table
-- Description: The order_errors table requires an order_id, which prevents us from logging critical errors 
-- when the order creation itself fails (e.g. constraint violations). This migration makes order_id nullable
-- so we can track "ghost payments" (failed order creations) with just the error details (metadata).

ALTER TABLE order_errors 
ALTER COLUMN order_id DROP NOT NULL;
