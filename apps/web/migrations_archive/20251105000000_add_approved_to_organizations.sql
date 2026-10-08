-- Migration: Add approval workflow to organizations
-- This allows admin to approve organizations before they can create events

-- Add approved column to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN organizations.approved IS 'Whether the organization has been approved by admin to create events. Default false - requires manual approval.';

-- Create index for faster queries filtering by approved status
CREATE INDEX IF NOT EXISTS idx_organizations_approved ON organizations(approved);

-- Add comment on updated_at to clarify its role in approval workflow
COMMENT ON COLUMN organizations.updated_at IS 'Timestamp when the organization was last updated. Updated when approval status changes.';

