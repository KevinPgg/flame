-- Add logo and cover image columns to organizations table
-- These allow organizers to upload a company logo and cover/banner image.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cover_image_url text;
